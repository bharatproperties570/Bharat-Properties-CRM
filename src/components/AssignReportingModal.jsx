import React, { useState } from 'react';
import { useUserContext } from '../context/UserContext';
import { getInitials } from '../utils/helpers';

const AssignReportingModal = ({ isOpen, onClose, managerName, managerId, onAssign }) => {
    const { users, updateUser } = useUserContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    // Filter users: 
    // 1. Not the manager themselves
    // 2. Matching search term
    const filteredUsers = users.filter(u =>
        u._id !== managerId &&
        (u.fullName || u.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAssign = async () => {
        if (!selectedUserId) {
            setError('Please select a user to assign');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const result = await updateUser(selectedUserId, { reportingTo: managerId });
            if (result.success) {
                if (onAssign) onAssign(result.data);
                onClose();
            } else {
                setError(result.error || 'Failed to assign user');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
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
                width: '500px',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Assign Team Member</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                        Reporting to: <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{managerName}</span>
                    </p>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', flex: 1, maxHeight: '400px', overflowY: 'auto' }}>
                    {error && (
                        <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#ef4444', fontSize: '0.8rem', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ position: 'relative', marginBottom: '16px' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                        <input
                            type="text"
                            placeholder="Find user to assign..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gap: '8px' }}>
                        {filteredUsers.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                No users found
                            </div>
                        ) : (
                            filteredUsers.map(user => (
                                <div
                                    key={user._id}
                                    onClick={() => setSelectedUserId(user._id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: selectedUserId === user._id ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                                        background: selectedUserId === user._id ? '#f0f7ff' : '#fff',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        background: '#f1f5f9',
                                        color: '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.75rem',
                                        fontWeight: 700
                                    }}>
                                        {getInitials(user.fullName || user.name || 'U')}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{user.fullName || user.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{user.department} - {user.role?.name || 'No Role'}</div>
                                    </div>
                                    {selectedUserId === user._id && (
                                        <i className="fas fa-check-circle" style={{ color: 'var(--primary-color)' }}></i>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={loading || !selectedUserId}
                        style={{ padding: '8px 20px', borderRadius: '6px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', opacity: (loading || !selectedUserId) ? 0.6 : 1 }}
                    >
                        {loading ? 'Assigning...' : 'Confirm Assignment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssignReportingModal;
