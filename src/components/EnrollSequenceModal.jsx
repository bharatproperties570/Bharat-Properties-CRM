import { useState } from 'react';
import { useSequences } from '../context/SequenceContext';

/**
 * EnrollSequenceModal — Enterprise Grade
 *
 * Key enterprise behaviours:
 *   1. Shows real-time enrollment status per sequence (active/paused/completed)
 *   2. Disables "Enroll" button if lead is already active/paused in selected sequence
 *   3. Passes source: 'manual' to enrollInSequence for full audit trail
 *   4. Shows enrolledBy source so admin can see if a Trigger or Sequence Engine auto-enrolled
 */
const EnrollSequenceModal = ({ isOpen, onClose, entityId, entityName, module = 'deals' }) => {
    const { sequences, enrollInSequence, isEnrolled, getActiveEnrollments } = useSequences();
    const [selectedSequenceId, setSelectedSequenceId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [enrollSuccess, setEnrollSuccess] = useState(false);

    if (!isOpen) return null;

    // Active sequences only (inactive are hidden from admin)
    const activeSequences = Array.isArray(sequences) ? sequences.filter(s => s && (s.active || s.isActive)) : [];

    // Current active/paused enrollments for this entity
    const currentEnrollments = typeof getActiveEnrollments === 'function' ? getActiveEnrollments(entityId) : [];

    // Per-sequence enrollment status for the selected sequence
    const selectedEnrollmentStatus = (selectedSequenceId && typeof isEnrolled === 'function')
        ? isEnrolled(entityId, selectedSequenceId)
        : { enrolled: false, status: null, enrolledBy: null };

    const isEnrollBlocked = selectedEnrollmentStatus.enrolled;

    const handleEnroll = async () => {
        if (!selectedSequenceId || isEnrollBlocked || isSubmitting) return;
        try {
            setIsSubmitting(true);
            const res = await enrollInSequence(entityId, selectedSequenceId, { source: 'manual', module });
            if (res && res.success === false && res.reason === 'already_enrolled') {
                setIsSubmitting(false);
                return;
            }
            setEnrollSuccess(true);
            setTimeout(() => {
                setIsSubmitting(false);
                setEnrollSuccess(false);
                onClose();
            }, 500);
        } catch (err) {
            console.error('[EnrollSequenceModal] Enrollment error:', err);
            setIsSubmitting(false);
            onClose();
        }
    };

    const formatActionType = (type) => {
        if (!type) return 'Automated Step';
        const map = {
            'fire_automated_action': 'Automated Action',
            'send_whatsapp': 'WhatsApp Message',
            'send_email': 'Email Message',
            'create_task': 'Create Task',
            'broadcast_deal': 'Broadcast Deal',
            'send_communication': 'Communication'
        };
        return map[type] || String(type).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const getDayLabel = (step, idx) => {
        if (!step) return `Day ${idx}`;
        const day = step.day ?? step.delay?.amount ?? (step.delayMs ? Math.floor(step.delayMs / 86400000) : idx);
        const unit = step.delay?.unit || 'days';
        const prefix = unit === 'minutes' ? 'Min' : (unit === 'hours' || unit === 'hourly') ? 'Hr' : 'Day';
        return `${prefix} ${day}`;
    };

    const statusColors = {
        active: { bg: '#dcfce7', text: '#166534', label: 'Active' },
        paused: { bg: '#fef3c7', text: '#92400e', label: 'Paused' },
        completed: { bg: '#e0f2fe', text: '#0369a1', label: 'Completed' },
        stopped: { bg: '#fee2e2', text: '#991b1b', label: 'Stopped' }
    };

    const sourceLabels = {
        trigger: { icon: 'fa-bolt', label: 'Auto: Trigger', color: '#6366f1' },
        sequence_engine: { icon: 'fa-cogs', label: 'Auto: Rules Engine', color: '#8b5cf6' },
        manual: { icon: 'fa-user', label: 'Manual', color: '#3b82f6' },
        system: { icon: 'fa-server', label: 'System', color: '#64748b' }
    };

    return (
        <div
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}
        >
            <div
                style={{ width: '90%', maxWidth: '520px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>Enroll in Sequence</h2>
                        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            Automate follow-up steps for <strong>{entityName}</strong>
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>

                <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Current Enrollments */}
                    {currentEnrollments.length > 0 && (
                        <div style={{ background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-stream" style={{ color: '#6366f1', fontSize: '0.8rem' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Currently Active Sequences
                                </span>
                            </div>
                            {currentEnrollments.map(enr => {
                                const seq = sequences.find(s => s.id === enr.sequenceId);
                                const statusStyle = statusColors[enr.status] || statusColors.active;
                                const srcStyle = sourceLabels[enr.enrolledBy] || sourceLabels.system;
                                return (
                                    <div key={enr.id} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b' }}>{seq?.name || enr.sequenceId}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                                <i className={`fas ${srcStyle.icon}`} style={{ fontSize: '0.65rem', color: srcStyle.color }} />
                                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{srcStyle.label}</span>
                                            </div>
                                        </div>
                                        <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, background: statusStyle.bg, color: statusStyle.text }}>
                                            {statusStyle.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Sequence Selector */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                            Select Sequence to Enroll
                        </label>
                        <select
                            value={selectedSequenceId}
                            onChange={e => setSelectedSequenceId(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                        >
                            <option value="">-- Choose a Sequence --</option>
                            {activeSequences.map(seq => {
                                const enrollStatus = isEnrolled(entityId, seq.id);
                                return (
                                    <option key={seq.id} value={seq.id}>
                                        {seq.name} ({seq.steps.length} steps)
                                        {enrollStatus.enrolled ? ` — Already ${enrollStatus.status}` : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {/* Already Enrolled Warning */}
                    {selectedSequenceId && isEnrollBlocked && (
                        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <i className="fas fa-exclamation-triangle" style={{ color: '#d97706', marginTop: '2px' }} />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', marginBottom: '4px' }}>
                                    Already {selectedEnrollmentStatus.status === 'paused' ? 'Paused' : 'Active'} in This Sequence
                                </div>
                                <div style={{ fontSize: '0.82rem', color: '#b45309' }}>
                                    {selectedEnrollmentStatus.status === 'paused'
                                        ? 'This sequence is paused (lead responded). Resume it instead of re-enrolling.'
                                        : 'Lead is actively progressing through this sequence. Re-enrollment not allowed to preserve sequence integrity.'}
                                </div>
                                {selectedEnrollmentStatus.enrolledBy && (
                                    <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <i className={`fas ${(sourceLabels[selectedEnrollmentStatus.enrolledBy] || sourceLabels.system).icon}`} />
                                        Enrolled by: <strong>{(sourceLabels[selectedEnrollmentStatus.enrolledBy] || sourceLabels.system).label}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Sequence Preview */}
                    {selectedSequenceId && !isEnrollBlocked && (
                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', color: '#64748b', margin: '0 0 12px' }}>
                                Sequence Preview
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {(sequences.find(s => s && (s.id === selectedSequenceId || s._id === selectedSequenceId))?.steps || []).map((step, idx) => (
                                    <div key={step?.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem' }}>
                                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                            {step?.stepNumber || (idx + 1)}
                                        </div>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                            {formatActionType(step?.type || step?.action?.type)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {step?.instruction || step?.action?.instruction || (step?.action?.automatedActionId ? 'Automated Action' : '')}
                                        </div>
                                        <div style={{ marginLeft: 'auto', color: '#3b82f6', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                                            {getDayLabel(step, idx)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} disabled={isSubmitting} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                        Cancel
                    </button>
                    <button
                        onClick={handleEnroll}
                        disabled={!selectedSequenceId || isEnrollBlocked || isSubmitting}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            background: enrollSuccess ? '#10b981' : (!selectedSequenceId || isEnrollBlocked || isSubmitting) ? '#cbd5e1' : '#3b82f6',
                            color: '#fff',
                            fontWeight: 700,
                            cursor: (!selectedSequenceId || isEnrollBlocked || isSubmitting) ? 'not-allowed' : 'pointer',
                            boxShadow: (!selectedSequenceId || isEnrollBlocked || isSubmitting) ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <i className="fas fa-spinner fa-spin" />
                                Enrolling...
                            </>
                        ) : enrollSuccess ? (
                            <>
                                <i className="fas fa-check" />
                                Enrolled!
                            </>
                        ) : isEnrollBlocked ? (
                            <>
                                <i className="fas fa-ban" />
                                Already Enrolled
                            </>
                        ) : (
                            <>
                                <i className="fas fa-play" />
                                Enroll Now
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EnrollSequenceModal;
