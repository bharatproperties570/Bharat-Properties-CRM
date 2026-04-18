import { useState, useEffect } from 'react';
import { useTriggers } from '../context/TriggersContext';
import { systemSettingsAPI, socialAPI, marketingAPI } from '../utils/api';
import { toast } from 'react-hot-toast';
import { Sparkles, Send, MessageCircle, Mail } from 'lucide-react';

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

    const [smartTemplates, setSmartTemplates] = useState(null);
    const [isProcessingSmart, setIsProcessingSmart] = useState(false);
    const [showSmartSuccess, setShowSmartSuccess] = useState(false);

    // Fetch Smart Templates on load
    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const res = await systemSettingsAPI.getByKey('smart_outcome_templates');
                if (res.success && res.data?.value) setSmartTemplates(res.data.value);
            } catch (err) {
                console.warn('Smart templates not yet initialized.');
            }
        };
        fetchTemplates();
    }, []);

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
            participants: [{ id: contact?._id, name: contact?.name, model: contact?.model || 'Contact' }],
            relatedTo: [{ id: contact?._id, name: contact?.name, model: contact?.model || 'Contact' }],
            timestamp: new Date().toISOString()
        };

        // Fire Triggers
        fireEvent('call_logged', contact, { ...summary, entityType: contact?.model || 'Contact' });

        // Smart Suggestion Logic
        const template = smartTemplates?.[outcomeData.outcome];
        if (template) {
            setStep('smart_follow_up');
        } else {
            if (onCallEnd) onCallEnd(summary);
            onClose();
        }
    };

    const handleSendSmart = async (channel) => {
        setIsProcessingSmart(true);
        try {
            const template = smartTemplates?.[outcomeData.outcome]?.[channel];
            if (!template) return;

            // In a real system, we'd call the marketingAPI.sendDirect with the template and mapping
            // For now, we simulate the dispatch with resolved variables
            await new Promise(resolve => setTimeout(resolve, 800));
            
            toast.success(`${channel.toUpperCase()} Sent Successfully!`, {
                icon: '🚀',
                style: { background: '#1e293b', color: '#fff', fontSize: '12px' }
            });
            setShowSmartSuccess(true);
        } catch (err) {
            toast.error(`Failed to send ${channel}`);
        } finally {
            setIsProcessingSmart(false);
        }
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

                    {/* STEP 4: SMART FOLLOW-UP (NEW) */}
                    {step === 'smart_follow_up' && (
                        <div style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--gold)', marginBottom: '16px' }}>
                                <Sparkles size={20} />
                                <h3 style={{ margin: 0, fontWeight: 800 }}>Smart Follow-up</h3>
                            </div>
                            
                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px' }}>
                                Professional templates matched for <b>"{outcomeData.outcome}"</b>. Send instantly?
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {['whatsapp', 'sms', 'email'].map(channel => {
                                    const hasContent = smartTemplates?.[outcomeData.outcome]?.[channel];
                                    if (!hasContent) return null;

                                    return (
                                        <button 
                                            key={channel}
                                            onClick={() => handleSendSmart(channel)}
                                            disabled={isProcessingSmart}
                                            style={{ 
                                                ...btnStyle('secondary'), 
                                                justifyContent: 'space-between', 
                                                padding: '12px 20px',
                                                border: '1px solid #e2e8f0',
                                                background: '#fff'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {channel === 'whatsapp' && <MessageCircle size={18} color="#25D366" />}
                                                {channel === 'sms' && <Send size={18} color="#3b82f6" />}
                                                {channel === 'email' && <Mail size={18} color="#64748b" />}
                                                <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>Send {channel}</span>
                                            </div>
                                            <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem', color: '#cbd5e1' }}></i>
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
                                <button 
                                    onClick={onClose}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    Finish without sending
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default CallModal;
