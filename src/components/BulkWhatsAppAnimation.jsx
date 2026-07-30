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
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed bottom-6 right-6 z-[999999] flex flex-col items-end justify-end pointer-events-none"
            >
                {/* Main Toast Container */}
                <motion.div 
                    initial={{ scale: 0.9, x: 50, opacity: 0 }}
                    animate={{ scale: 1, x: 0, opacity: 1 }}
                    exit={{ scale: 0.9, x: 50, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="relative w-80 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-[0_10px_40px_rgba(34,197,94,0.3)] backdrop-blur-xl pointer-events-auto cursor-pointer"
                    onClick={isDone ? onClose : undefined}
                >
                    {/* Progress Ring / Glow Background */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-20">
                        <svg className="h-64 w-64 -rotate-90 transform" viewBox="0 0 100 100">
                            <circle
                                cx="50"
                                cy="50"
                                r="45"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="2"
                            />
                            <motion.circle
                                cx="50"
                                cy="50"
                                r="45"
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="4"
                                strokeDasharray="283"
                                strokeDashoffset={283 - (283 * progress) / 100}
                                strokeLinecap="round"
                                className="transition-all duration-500 ease-in-out"
                            />
                        </svg>
                    </div>

                    <div className="relative z-10 flex flex-col items-center text-center">
                        
                        {/* 3D Icon Container */}
                        <div className="relative mb-8 h-32 w-32">
                            <AnimatePresence mode="wait">
                                {phase === 'morphing' && (
                                    <motion.div
                                        key="chat"
                                        initial={{ scale: 0.5, rotate: -10, opacity: 0 }}
                                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                        exit={{ scale: 1.5, filter: "blur(10px)", opacity: 0 }}
                                        transition={{ duration: 0.8, ease: "easeInOut" }}
                                        className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-tr from-green-600 to-emerald-400 shadow-[0_0_30px_rgba(34,197,94,0.5)]"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 2C6.48 2 2 6.03 2 11c0 2.05.74 3.94 2.02 5.46L3 21.5l5.13-1.37A10.63 10.63 0 0012 20c5.52 0 10-4.03 10-9s-4.48-9-10-9zm0 16.2c-1.57 0-3.04-.39-4.33-1.07l-3.05.81.82-2.95C4.24 13.9 3.5 12.51 3.5 11c0-4.14 3.81-7.5 8.5-7.5s8.5 3.36 8.5 7.5-3.81 7.5-8.5 7.5z"/>
                                        </svg>
                                    </motion.div>
                                )}
                                
                                {phase === 'flying' && (
                                    <motion.div
                                        key="plane"
                                        initial={{ x: -100, y: 100, scale: 0.5, opacity: 0 }}
                                        animate={{ 
                                            x: [0, 5, -5, 0], 
                                            y: [0, -10, 5, 0],
                                            scale: 1, 
                                            opacity: 1 
                                        }}
                                        transition={{ 
                                            x: { repeat: Infinity, duration: 3, ease: "easeInOut" },
                                            y: { repeat: Infinity, duration: 2.5, ease: "easeInOut" },
                                            opacity: { duration: 0.5 }
                                        }}
                                        className="absolute inset-0 flex items-center justify-center drop-shadow-[0_10px_20px_rgba(255,255,255,0.2)]"
                                    >
                                        <Send className="h-20 w-20 text-white/90" style={{ filter: "drop-shadow(0 0 15px rgba(255,255,255,0.4))" }} strokeWidth={1} />
                                        
                                        {/* Motion Trail */}
                                        <motion.div 
                                            animate={{ opacity: [0.5, 0], scale: [1, 1.5] }}
                                            transition={{ repeat: Infinity, duration: 1 }}
                                            className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-blue-400/20 blur-xl"
                                        />
                                    </motion.div>
                                )}

                                {phase === 'success' && (
                                    <motion.div
                                        key="success"
                                        initial={{ scale: 0, rotate: 180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: "spring", damping: 12, stiffness: 100 }}
                                        className="absolute inset-0 flex items-center justify-center"
                                    >
                                        <CheckCircle2 className="h-24 w-24 text-green-400 drop-shadow-[0_0_20px_rgba(34,197,94,0.6)]" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Typography & Data */}
                        <div className="space-y-3">
                            <motion.h3 
                                animate={{ opacity: phase === 'success' ? 1 : 0.9 }}
                                className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-bold tracking-tight text-transparent"
                            >
                                {phase === 'morphing' ? 'Initiating Transfer' : 
                                 phase === 'success' ? 'Delivery Complete' : 
                                 'Sending Messages'}
                            </motion.h3>

                            {phase === 'flying' && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col gap-1"
                                >
                                    <p className="text-lg font-semibold text-green-400">
                                        {completed} <span className="text-sm font-normal text-slate-400">/ {total} Delivered</span>
                                    </p>
                                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <span>ETA: {etaString}</span>
                                    </div>
                                </motion.div>
                            )}

                            {phase === 'success' && (
                                <motion.p 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-sm text-green-500/80"
                                >
                                    All {total} packages secured and delivered.
                                </motion.p>
                            )}
                        </div>

                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default BulkWhatsAppAnimation;
