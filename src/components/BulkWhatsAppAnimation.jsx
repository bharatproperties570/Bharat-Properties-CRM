import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle2, Loader2 } from 'lucide-react';

const BulkWhatsAppAnimation = ({ isOpen, total = 0, completed = 0, onClose }) => {
    const [phase, setPhase] = useState('idle'); // idle, morphing, flying, success
    const progress = total > 0 ? Math.min((completed / total) * 100, 100) : 0;
    const isDone = completed >= total && total > 0;

    useEffect(() => {
        if (isOpen && phase === 'idle') {
            setPhase('morphing');
            setTimeout(() => setPhase('flying'), 1500);
        }
    }, [isOpen, phase]);

    useEffect(() => {
        if (isDone && phase === 'flying') {
            setPhase('success');
            setTimeout(() => {
                if (onClose) onClose();
                setPhase('idle');
            }, 3000); // Wait 3 seconds on success before closing
        }
    }, [isDone, phase, onClose]);

    // Estimated time calculation (mock logic for demo, assumes ~1 sec per message)
    const remaining = total - completed;
    const etaSeconds = remaining * 1.5; 
    const etaString = etaSeconds > 60 
        ? `${Math.floor(etaSeconds / 60)}m ${Math.floor(etaSeconds % 60)}s`
        : `${Math.floor(etaSeconds)}s`;

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        zIndex: 9999999,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        justifyContent: 'flex-end',
                        pointerEvents: 'none'
                    }}
                >
                    {/* Main Toast Container */}
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        style={{
                            position: 'relative',
                            width: '200px',
                            overflow: 'hidden',
                            borderRadius: '16px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            background: 'rgba(15, 23, 42, 0.95)',
                            padding: '16px',
                            boxShadow: '0 10px 40px rgba(34, 197, 94, 0.25), 0 4px 12px rgba(0, 0, 0, 0.3)',
                            backdropFilter: 'blur(24px)',
                            pointerEvents: 'auto',
                            cursor: isDone ? 'pointer' : 'default',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: '14px',
                            fontFamily: 'Inter, system-ui, sans-serif'
                        }}
                        onClick={isDone ? onClose : undefined}
                    >
                        {/* Progress Ring / Glow Background */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            paddingLeft: '12px',
                            opacity: 0.15,
                            pointerEvents: 'none'
                        }}>
                            <svg style={{ height: '48px', width: '48px', transform: 'rotate(-90deg)' }} viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                                <motion.circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke="#22c55e"
                                    strokeWidth="8"
                                    strokeDasharray="283"
                                    strokeDashoffset={283 - (283 * progress) / 100}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                                />
                            </svg>
                        </div>

                        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', width: '100%' }}>
                            
                            {/* Icon Container */}
                            <div style={{ position: 'relative', height: '42px', width: '42px', flexShrink: 0 }}>
                                <AnimatePresence mode="wait">
                                    {phase === 'morphing' && (
                                        <motion.div
                                            key="chat"
                                            initial={{ scale: 0.5, rotate: -10, opacity: 0 }}
                                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                            exit={{ scale: 1.2, opacity: 0 }}
                                            transition={{ duration: 0.5 }}
                                            style={{
                                                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                borderRadius: '50%', background: 'linear-gradient(to top right, #16a34a, #34d399)',
                                                boxShadow: '0 0 15px rgba(34,197,94,0.4)'
                                            }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" style={{ height: '22px', width: '22px', color: '#fff' }} viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 2C6.48 2 2 6.03 2 11c0 2.05.74 3.94 2.02 5.46L3 21.5l5.13-1.37A10.63 10.63 0 0012 20c5.52 0 10-4.03 10-9s-4.48-9-10-9zm0 16.2c-1.57 0-3.04-.39-4.33-1.07l-3.05.81.82-2.95C4.24 13.9 3.5 12.51 3.5 11c0-4.14 3.81-7.5 8.5-7.5s8.5 3.36 8.5 7.5-3.81 7.5-8.5 7.5z"/>
                                            </svg>
                                        </motion.div>
                                    )}
                                    
                                    {phase === 'flying' && (
                                        <motion.div
                                            key="plane"
                                            initial={{ x: -40, y: 40, scale: 0.5, opacity: 0 }}
                                            animate={{ x: [ -40, 0, 60 ], y: [ 40, 0, -60 ], scale: [0.5, 1, 1.2], opacity: [0, 1, 0] }}
                                            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <Send style={{ height: '24px', width: '24px', color: 'rgba(255,255,255,0.95)', filter: "drop-shadow(0 0 8px rgba(255,255,255,0.5))" }} strokeWidth={2} />
                                        </motion.div>
                                    )}

                                    {phase === 'success' && (
                                        <motion.div
                                            key="success"
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <CheckCircle2 style={{ height: '32px', width: '32px', color: '#4ade80', filter: 'drop-shadow(0 0 10px rgba(34,197,94,0.6))' }} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Typography & Data */}
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                <motion.h3 
                                    animate={{ opacity: phase === 'success' ? 1 : 0.9 }}
                                    style={{
                                        margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        background: 'linear-gradient(to right, #ffffff, rgba(255,255,255,0.7))',
                                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                        fontSize: '0.9rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2
                                    }}
                                >
                                    {phase === 'morphing' ? 'Initiating...' : phase === 'success' ? 'Completed' : 'Sending...'}
                                </motion.h3>

                                {phase === 'flying' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', marginTop: '2px' }}>
                                        <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#4ade80', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {completed} / {total} Done
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} style={{ display: 'flex', alignItems: 'center' }}>
                                                <Loader2 style={{ height: '10px', width: '10px' }} />
                                            </motion.div>
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ETA: {etaString}</span>
                                        </div>
                                    </motion.div>
                                )}

                                {phase === 'success' && (
                                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ margin: 0, fontSize: '11px', color: 'rgba(74, 222, 128, 0.9)', lineHeight: 1.2, fontWeight: 600, marginTop: '2px' }}>
                                        All {total} sent.
                                    </motion.p>
                                )}
                            </div>

                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default BulkWhatsAppAnimation;
