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

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2>Enroll in Sequence</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '20px' }}>
                        Select a sequence to automate follow-ups for <strong>{entityName}</strong>.
                    </p>

                    {existingEnrollment ? (
                        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
                            <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0 }}>
                                <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
                                This lead is already enrolled in <strong>{sequences.find(s => s.id === existingEnrollment.sequenceId)?.name}</strong>.
                            </p>
                        </div>
                    ) : null}

                    <div className="form-group">
                        <label>Select Sequence</label>
                        <select
                            value={selectedSequenceId}
                            onChange={(e) => setSelectedSequenceId(e.target.value)}
                            className="form-input"
                        >
                            <option value="">-- Choose a Sequence --</option>
                            {activeSequences.map(seq => (
                                <option key={seq.id} value={seq.id}>{seq.name} ({seq.steps.length} steps)</option>
                            ))}
                        </select>
                    </div>

                    {selectedSequenceId && (
                        <div style={{ marginTop: '20px', background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '10px', color: '#1e293b' }}>Sequence Preview:</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {sequences.find(s => s.id === selectedSequenceId)?.steps.map((step, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem' }}>
                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{idx + 1}</div>
                                        <div style={{ fontWeight: 600 }}>{step.type}</div>
                                        <div style={{ color: '#64748b' }}>Day {step.day}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn-outline" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={handleEnroll}
                        disabled={!selectedSequenceId}
                    >
                        Enroll Now
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EnrollSequenceModal;
