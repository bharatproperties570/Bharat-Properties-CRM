import React, { useState, useEffect } from 'react';
import { useTriggers } from '../context/TriggersContext';

const CallModal = ({ isOpen, onClose, contact, onCallEnd }) => {
    const { fireEvent } = useTriggers();
    const [step, setStep] = useState('selection'); // selection, calling, summary
    const [callType, setCallType] = useState(null); // 'GSM', 'IVR'
    const [callStatus, setCallStatus] = useState('Idle'); // Idle, Calling, Connected, Ended
    const [timer, setTimer] = useState(0);

    // IVR Config
    const [ivrConfig, setIvrConfig] = useState({
        number: '',
        flow: 'Sales',
        agent: 'Self'
    });

    // Call Details
    const [callDetails, setCallDetails] = useState({
        purpose: 'Follow-up',
        notes: '',
        outcome: '',
        result: '',
        followUpDate: ''
    });

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

    // Format Timer
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCallStart = () => {
        setStep('calling');
        setCallStatus('Calling');

        // Simulate connection delay
        setTimeout(() => {
            setCallStatus('Connected');
        }, 2000);
    };

    const handleEndCall = () => {
        setCallStatus('Ended');
        setStep('summary');
    };

    const handleSave = () => {
        const summary = {
            contact: contact || { name: 'Unknown', mobile: 'N/A' },
            type: callType,
            duration: timer,
            ...callDetails,
            timestamp: new Date().toISOString()
        };
        console.log('Call Logged:', summary);

        // Fire Triggers
        fireEvent('call_logged', summary, { entityType: 'communication' });

        if (summary.outcome) {
            fireEvent('call_outcome_selected', summary, {
                entityType: 'communication',
                outcome: summary.outcome
            });
        }

        if (onCallEnd) onCallEnd(summary);
        onClose();
    };

    if (!isOpen) return null;

    // Styles
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: isOpen ? 1 : 0, transition: 'opacity 0.2s ease-in-out'
    };

    const modalStyle = {
        backgroundColor: '#fff', borderRadius: '16px',
        width: '500px', maxWidth: '95vw',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    };

    const headerStyle = {
        padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#fff'
    };

    const labelStyle = {
        display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px'
    };

    const inputStyle = {
        width: '100%', padding: '10px', borderRadius: '8px',
        border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#1e293b',
        outline: 'none', backgroundColor: '#f8fafc', transition: 'all 0.2s'
    };

    // Card Selection Style
    const cardStyle = (selected) => ({
        flex: 1, padding: '16px', borderRadius: '12px', border: `2px solid ${selected ? 'var(--primary-color)' : '#e2e8f0'}`,
        backgroundColor: selected ? 'rgba(59, 130, 246, 0.05)' : '#fff', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
    });

    return (
        <div style={overlayStyle}>
            <style>
                {`
                    @keyframes slideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    @keyframes pulse-ring {
                        0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                        100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                    }
                `}
            </style>
            <div style={modalStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-color)',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                        }}>
                            {contact?.name ? contact.name.charAt(0) : 'U'}
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                {step === 'calling' ? 'Call in Progress' : step === 'summary' ? 'Call Summary' : 'Call Contact'}
                            </h2>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0' }}>
                                {contact?.name || 'Unknown Contact'} • {contact?.mobile || 'No Number'}
                            </p>
                        </div>
                    </div>
                    {step !== 'calling' && (
                        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                            <i className="fas fa-times" style={{ fontSize: '1.2rem' }}></i>
                        </button>
                    )}
                </div>

                {/* Body */}
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>

                    {/* STEP 1: SELECTION */}
                    {step === 'selection' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                            {/* Call Type Cards */}
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={cardStyle(callType === 'GSM')} onClick={() => setCallType('GSM')}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-phone-alt" style={{ fontSize: '1.2rem', color: '#2563eb' }}></i>
                                    </div>
                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>GSM Call</span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Direct mobile call</span>
                                </div>
                                <div style={cardStyle(callType === 'IVR')} onClick={() => setCallType('IVR')}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-headset" style={{ fontSize: '1.2rem', color: '#16a34a' }}></i>
                                    </div>
                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>IVR Call</span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Tracked & recorded</span>
                                </div>
                            </div>

                            {/* IVR Config */}
                            {callType === 'IVR' && (
                                <div className="animate-fade-in" style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#334155' }}>IVR Configuration</h4>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={labelStyle}>IVR Number</label>
                                        <select
                                            value={ivrConfig.number}
                                            onChange={(e) => setIvrConfig({ ...ivrConfig, number: e.target.value })}
                                            style={inputStyle}
                                        >
                                            <option value="">Select Virtual Number</option>
                                            <option value="+91 8000 123 456">Sales Line (+91 8000 123 456)</option>
                                            <option value="+91 8000 987 654">Support Line (+91 8000 987 654)</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Flow</label>
                                            <select style={inputStyle} value={ivrConfig.flow} onChange={e => setIvrConfig({ ...ivrConfig, flow: e.target.value })}>
                                                <option>Sales</option>
                                                <option>Support</option>
                                                <option>Follow-up</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Agent</label>
                                            <select style={inputStyle} value={ivrConfig.agent} onChange={e => setIvrConfig({ ...ivrConfig, agent: e.target.value })}>
                                                <option value="Self">Self (Suraj)</option>
                                                <option value="RoundRobin">Round Robin</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Pre-Call Notes */}
                            <div>
                                <label style={labelStyle}>Purpose</label>
                                <select
                                    style={inputStyle}
                                    value={callDetails.purpose}
                                    onChange={(e) => setCallDetails({ ...callDetails, purpose: e.target.value })}
                                >
                                    <option>Follow-up</option>
                                    <option>New Lead</option>
                                    <option>Property Discussion</option>
                                    <option>Negotiation</option>
                                    <option>Closing</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: CALLING SCREEN */}
                    {step === 'calling' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px 0' }}>
                            <div style={{
                                width: '100px', height: '100px', borderRadius: '50%', background: '#fee2e2',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
                                animation: callStatus === 'Calling' ? 'pulse-ring 2s infinite' : 'none'
                            }}>
                                <i className="fas fa-phone" style={{ fontSize: '2.5rem', color: '#ef4444' }}></i>
                            </div>

                            <h3 style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: '8px' }}>
                                {callStatus === 'Calling' ? 'Calling...' : formatTime(timer)}
                            </h3>
                            <p style={{ color: '#64748b' }}>{callType} Call via {callType === 'GSM' ? 'Network' : 'Cloud Telephony'}</p>

                            {callStatus === 'Connected' && (
                                <div style={{ marginTop: '30px', width: '100%' }}>
                                    <label style={labelStyle}>Quick Notes</label>
                                    <textarea
                                        placeholder="Type notes while talking..."
                                        rows="4"
                                        style={inputStyle}
                                        value={callDetails.notes}
                                        onChange={(e) => setCallDetails(prev => ({ ...prev, notes: e.target.value }))}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: SUMMARY */}
                    {step === 'summary' && (
                        <div className="animate-fade-in">
                            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                <div style={{ display: 'inline-block', padding: '8px 16px', background: '#f0fdf4', borderRadius: '20px', color: '#15803d', fontWeight: 600, fontSize: '0.9rem' }}>
                                    Call Ended • {formatTime(timer)}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Status <span style={{ color: '#ef4444' }}>*</span></label>
                                    <select
                                        style={inputStyle}
                                        value={callDetails.outcome}
                                        onChange={(e) => setCallDetails({ ...callDetails, outcome: e.target.value })}
                                    >
                                        <option value="">Select Status</option>
                                        <option value="Connected">Connected</option>
                                        <option value="Not Answered">Not Answered</option>
                                        <option value="Busy">Busy</option>
                                        <option value="Wrong Number">Wrong Number</option>
                                    </select>
                                </div>
                                {callDetails.outcome === 'Connected' && (
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Result <span style={{ color: '#ef4444' }}>*</span></label>
                                        <select
                                            style={inputStyle}
                                            value={callDetails.result}
                                            onChange={(e) => setCallDetails({ ...callDetails, result: e.target.value })}
                                        >
                                            <option value="">Select Result</option>
                                            <option value="Interested">Interested</option>
                                            <option value="Not Interested">Not Interested</option>
                                            <option value="Meeting Scheduled">Meeting Scheduled</option>
                                            <option value="Follow-up Required">Follow-up Required</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>Final Notes</label>
                                <textarea
                                    rows="3"
                                    style={inputStyle}
                                    value={callDetails.notes}
                                    onChange={(e) => setCallDetails({ ...callDetails, notes: e.target.value })}
                                    placeholder="Summarize the conversation..."
                                />
                            </div>

                            {['Not Answered', 'Busy', 'Follow-up Required'].includes(callDetails.outcome) || callDetails.result === 'Follow-up Required' ? (
                                <div>
                                    <label style={labelStyle}>Follow-up Date</label>
                                    <input
                                        type="date"
                                        style={inputStyle}
                                        value={callDetails.followUpDate}
                                        onChange={(e) => setCallDetails({ ...callDetails, followUpDate: e.target.value })}
                                    />
                                </div>
                            ) : null}

                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>

                    {step === 'selection' && (
                        <>
                            <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button
                                onClick={handleCallStart}
                                disabled={!callType}
                                style={{
                                    padding: '10px 24px', borderRadius: '8px', border: 'none',
                                    background: !callType ? '#cbd5e1' : 'var(--primary-color)',
                                    color: '#fff', fontWeight: 600, cursor: !callType ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <i className="fas fa-phone"></i> Call Now
                            </button>
                        </>
                    )}

                    {step === 'calling' && (
                        <button
                            onClick={handleEndCall}
                            style={{
                                width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
                                background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}
                        >
                            <i className="fas fa-phone-slash"></i> End Call
                        </button>
                    )}

                    {step === 'summary' && (
                        <button
                            onClick={handleSave}
                            style={{
                                padding: '10px 32px', borderRadius: '8px', border: 'none',
                                background: 'var(--primary-color)', color: '#fff', fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            Save & Close
                        </button>
                    )}

                </div>
            </div>
        </div>
    );
};

export default CallModal;
