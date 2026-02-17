import React, { useState } from 'react';

const InactivateUserModal = ({ isOpen, onClose, onConfirm, user }) => {
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState('indefinite'); // indefinite, 1_day, 1_week, 1_month, custom
    const [customDate, setCustomDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!reason.trim()) {
            setError('Please provide a reason for inactivation.');
            return;
        }

        if (duration === 'custom' && !customDate) {
            setError('Please select a reactivation date.');
            return;
        }

        setLoading(true);
        try {
            await onConfirm({
                reason,
                duration,
                customDate: duration === 'custom' ? customDate : null
            });
            onClose();
        } catch (err) {
            setError('Failed to update status. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
            <div style={{
                background: '#fff', width: '450px', borderRadius: '12px',
                padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                    Deactivate User
                </h2>
                <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '20px' }}>
                    You are about to deactivate <strong>{user?.fullName}</strong>. They will lose access to the system.
                </p>

                {error && (
                    <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '0.85rem', marginBottom: '16px' }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>
                        Reason <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. On Leave, Resigned, Suspended..."
                        rows="3"
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', resize: 'none' }}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>
                        Duration (Auto-Reactivate)
                    </label>
                    <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: '#fff' }}
                    >
                        <option value="indefinite">Indefinite (Manual Reactivation)</option>
                        <option value="1_day">1 Day</option>
                        <option value="1_week">1 Week</option>
                        <option value="1_month">1 Month</option>
                        <option value="custom">Custom Date</option>
                    </select>
                </div>

                {duration === 'custom' && (
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>
                            Reactivation Date
                        </label>
                        <input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        />
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '8px 20px', borderRadius: '6px', background: '#fff', border: '1px solid #e2e8f0', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{ padding: '8px 20px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? 'Deactivating...' : 'Deactivate User'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InactivateUserModal;
