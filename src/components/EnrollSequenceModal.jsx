import React, { useState } from 'react';
import { useSequences } from '../context/SequenceContext';

const EnrollSequenceModal = ({ isOpen, onClose, entityId, entityName }) => {
    const { sequences, enrollInSequence, enrollments } = useSequences();
    const [selectedSequenceId, setSelectedSequenceId] = useState('');

    if (!isOpen) return null;

    const activeSequences = sequences.filter(s => s.isActive);
    const existingEnrollment = enrollments.find(e => e.entityId === entityId && e.status === 'active');

    const handleEnroll = () => {
        if (!selectedSequenceId) return;
        enrollInSequence(entityId, selectedSequenceId);
        onClose();
    };

    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    };

    const modalStyle = {
        width: '90%',
        maxWidth: '500px',
        backgroundColor: '#fff',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Enroll in Sequence</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
                    >
                        &times;
                    </button>
                </div>

                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '24px' }}>
                        Select a sequence to automate follow-ups for <strong>{entityName}</strong>.
                    </p>

                    {existingEnrollment ? (
                        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: '8px', marginBottom: '24px' }}>
                            <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-exclamation-triangle"></i>
                                This lead is already enrolled in <strong>{sequences.find(s => s.id === existingEnrollment.sequenceId)?.name}</strong>.
                            </p>
                        </div>
                    ) : null}

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                            Select Sequence
                        </label>
                        <select
                            value={selectedSequenceId}
                            onChange={(e) => setSelectedSequenceId(e.target.value)}
                            className="form-control"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                background: '#f8fafc'
                            }}
                        >
                            <option value="">-- Choose a Sequence --</option>
                            {activeSequences.map(seq => (
                                <option key={seq.id} value={seq.id}>{seq.name} ({seq.steps.length} steps)</option>
                            ))}
                        </select>
                    </div>

                    {selectedSequenceId && (
                        <div style={{ marginTop: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', color: '#64748b' }}>
                                Sequence Preview
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {sequences.find(s => s.id === selectedSequenceId)?.steps.map((step, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem' }}>
                                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, color: '#475569' }}>
                                            {idx + 1}
                                        </div>
                                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{step.type}</div>
                                        <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.7rem', fontWeight: 500 }}>
                                            Day {step.day}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleEnroll}
                        disabled={!selectedSequenceId}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            background: selectedSequenceId ? '#3b82f6' : '#cbd5e1',
                            color: '#fff',
                            fontWeight: 700,
                            cursor: selectedSequenceId ? 'pointer' : 'not-allowed',
                            boxShadow: selectedSequenceId ? '0 4px 12px rgba(59, 130, 246, 0.2)' : 'none'
                        }}
                    >
                        Enroll Now
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EnrollSequenceModal;
