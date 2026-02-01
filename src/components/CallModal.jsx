import React, { useState, useEffect } from 'react';
import { useTriggers } from '../context/TriggersContext';

const CallModal = ({ isOpen, onClose, contact, context, onCallEnd }) => {
    const { fireEvent } = useTriggers();
    const [step, setStep] = useState('context'); // context, calling, outcome
    const [callType, setCallType] = useState(null); // 'GSM', 'IVR'
    const [callStatus, setCallStatus] = useState('Idle');
    const [timer, setTimer] = useState(0);

    // Context Analysis (Why are we calling?)
    const callPurpose = context?.purpose || 'General Follow-up';
    const isVerification = callPurpose.includes('Verification') || callPurpose.includes('Owner');

    // Call Details
    const [outcomeData, setOutcomeData] = useState({
        outcome: '', // Confirmed, Needs Follow-up, etc.
        result: '', // Interested, Not Interested
        notes: '',
        followUpDate: ''
    });

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setStep('context');
            setCallStatus('Idle');
            setTimer(0);
            setOutcomeData({ outcome: '', result: '', notes: '', followUpDate: '' });
        }
    }, [isOpen]);

    // Timer Logic
    useEffect(() => {
        let interval;
        if (callStatus === 'Connected') {
            interval = setInterval(() => {
                setTimer(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [callStatus]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCallStart = (type) => {
        setCallType(type);
        setStep('calling');
        setCallStatus('Calling');
        // Simulate connection
        setTimeout(() => setCallStatus('Connected'), 1500);
    };

    const handleEndCall = () => {
        setCallStatus('Ended');
        setStep('outcome');
    };

    const handleSubmitOutcome = () => {
        if (!outcomeData.outcome) return; // Validation

        const summary = {
            duration: timer,
            type: callType,
            ...outcomeData,
            timestamp: new Date().toISOString()
        };

        // Fire Triggers
        fireEvent('call_logged', summary, { entityType: 'communication' });

        if (onCallEnd) onCallEnd(summary);
    };

    if (!isOpen) return null;

    // --- STYLES ---
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)',
        zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center'
    };
    const modalStyle = {
        backgroundColor: '#fff', borderRadius: '16px', width: '480px', maxWidth: '90vw',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease-out'
    };
    const btnStyle = (variant) => ({
        padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        fontWeight: 600, fontSize: '0.9rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        background: variant === 'primary' ? 'var(--primary-color)' : variant === 'danger' ? '#ef4444' : '#f1f5f9',
        color: variant === 'primary' || variant === 'danger' ? '#fff' : '#475569'
    });

    return (
        <div style={overlayStyle}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
            <div style={modalStyle}>

                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                            {contact?.name || 'Unknown Contact'}
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                            {contact?.mobile} • {callPurpose}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><i className="fas fa-times"></i></button>
                </div>

                {/* Content Body */}
                <div style={{ padding: '24px' }}>

                    {/* STEP 1: CONTEXT & PRE-CALL */}
                    {step === 'context' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #dbeafe' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', marginBottom: '4px' }}>CALL CONTEXT</div>
                                <div style={{ fontSize: '0.9rem', color: '#1e3a8a' }}>
                                    {isVerification ?
                                        "Verify ownership details. Confirm asking price and availability." :
                                        "Follow up on interest. Check readiness for site visit."}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <button style={btnStyle('primary')} onClick={() => handleCallStart('GSM')}>
                                    <i className="fas fa-mobile-alt"></i> Mobile Call
                                </button>
                                <button style={btnStyle('secondary')} onClick={() => handleCallStart('WhatsApp')}>
                                    <i className="fab fa-whatsapp"></i> WhatsApp Call
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: ACTIVE CALL SIMULATION */}
                    {step === 'calling' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{
                                width: '80px', height: '80px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444',
                                margin: '0 auto 20px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem',
                                animation: callStatus === 'Calling' ? 'pulse 1.5s infinite' : 'none'
                            }}>
                                <i className="fas fa-phone"></i>
                            </div>
                            <h2 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>{callStatus === 'Connected' ? formatTime(timer) : 'Connecting...'}</h2>
                            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{callType} Call in progress...</p>

                            <div style={{ marginTop: '30px' }}>
                                <button style={btnStyle('danger')} onClick={handleEndCall}>End Call</button>
                            </div>
                            <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }`}</style>
                        </div>
                    )}

                    {/* STEP 3: OUTCOME (MANDATORY) */}
                    {step === 'outcome' && (
                        <div className="animate-fade-in">
                            <h4 style={{ margin: '0 0 16px 0', color: '#334155' }}>Select Call Outcome</h4>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                                {['Confirmed', 'Needs Follow-up', 'Not Picked', 'Busy/Cut', 'Wrong Number'].map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => setOutcomeData({ ...outcomeData, outcome: opt })}
                                        style={{
                                            ...btnStyle(outcomeData.outcome === opt ? 'primary' : 'secondary'),
                                            justifyContent: 'center', padding: '12px', fontSize: '0.85rem'
                                        }}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                placeholder="Add notes (optional)..."
                                value={outcomeData.notes}
                                onChange={e => setOutcomeData({ ...outcomeData, notes: e.target.value })}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px', fontSize: '0.9rem' }}
                                rows={3}
                            />

                            <button
                                onClick={handleSubmitOutcome}
                                disabled={!outcomeData.outcome}
                                style={{ ...btnStyle('primary'), opacity: !outcomeData.outcome ? 0.5 : 1 }}
                            >
                                Save Outcome
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default CallModal;
