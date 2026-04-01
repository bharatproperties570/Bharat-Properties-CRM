import React from 'react';

const ContactAutomation = React.memo(function ContactAutomation({
    contact,
    enrollments,
    sequences,
    updateEnrollmentStatus,
    setIsEnrollModalOpen
}) {
    return (
        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)', boxShadow: '0 8px 32px 0 rgba(59, 130, 246, 0.05)' }}>
            <div style={{ padding: '14px 20px', background: 'rgba(59, 130, 246, 0.05)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-robot"></i> Automation & Sequences
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => setIsEnrollModalOpen(true)}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 900, cursor: 'pointer' }}
                    >
                        <i className="fas fa-plus"></i> ENROLL
                    </button>
                </div>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {enrollments.filter(e => e.entityId === (contact?._id || contact?.mobile) && e.status === 'active').map(enrollment => {
                    const seq = sequences.find(s => s.id === enrollment.sequenceId);
                    if (!seq) return null;
                    return (
                        <div key={enrollment.id} style={{ background: '#fff', border: '1px solid #eef2f6', borderRadius: '12px', padding: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{seq.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>Started {new Date(enrollment.enrolledAt).toLocaleDateString()}</div>
                                </div>
                                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 900 }}>ACTIVE</span>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '4px' }}>
                                    <span style={{ color: '#64748b', fontWeight: 700 }}>Next Step: {seq.steps[enrollment.currentStep]?.type || 'Completed'}</span>
                                    <span style={{ color: '#1e293b', fontWeight: 800 }}>{Math.round((enrollment.currentStep / seq.steps.length) * 100)}%</span>
                                </div>
                                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${(enrollment.currentStep / seq.steps.length) * 100}%`, height: '100%', background: '#3b82f6' }}></div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => updateEnrollmentStatus(contact?._id || contact?.mobile, 'paused')}
                                    style={{ flex: 1, padding: '6px', fontSize: '0.65rem', fontWeight: 800, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    Pause
                                </button>
                                <button
                                    onClick={() => updateEnrollmentStatus(contact?._id || contact?.mobile, 'stopped')}
                                    style={{ flex: 1, padding: '6px', fontSize: '0.65rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    Stop
                                </button>
                            </div>
                        </div>
                    );
                })}

                <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Recent Logs</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {enrollments.filter(e => e.entityId === (contact?._id || contact?.mobile)).flatMap(e => e.logs || []).slice(-3).reverse().map((log, i) => (
                            <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '0.7rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', marginTop: '4px' }}></div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: '#1e293b', fontWeight: 600 }}>{log.message}</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});

ContactAutomation.displayName = 'ContactAutomation';

export default ContactAutomation;
