import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import BulkWhatsAppAnimation from '../components/BulkWhatsAppAnimation';

const WhatsAppAnimationContext = createContext();

export const useWhatsAppAnimation = () => useContext(WhatsAppAnimationContext);

export const WhatsAppAnimationProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [total, setTotal] = useState(0);
    const [completed, setCompleted] = useState(0);
    const [closeCallback, setCloseCallback] = useState(null);

    // Event listeners to handle dispatches from anywhere (even outside React tree)
    useEffect(() => {
        const handleStart = (e) => {
            const { total = 1, onComplete } = e.detail || {};
            setTotal(total);
            setCompleted(0);
            setIsOpen(true);
            if (onComplete) {
                setCloseCallback(() => onComplete);
            } else {
                setCloseCallback(null);
            }
        };

        const handleProgress = (e) => {
            const { completed } = e.detail || {};
            if (completed !== undefined) {
                setCompleted(completed);
            }
        };

        const handleEnd = () => {
            // By setting completed >= total, the animation naturally enters its 'success' phase
            // and manages its own unmounting delay.
            setCompleted(prev => Math.max(prev, total)); 
        };

        window.addEventListener('wa_dispatch_start', handleStart);
        window.addEventListener('wa_dispatch_progress', handleProgress);
        window.addEventListener('wa_dispatch_end', handleEnd);

        return () => {
            window.removeEventListener('wa_dispatch_start', handleStart);
            window.removeEventListener('wa_dispatch_progress', handleProgress);
            window.removeEventListener('wa_dispatch_end', handleEnd);
        };
    }, [total]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        if (closeCallback) {
            closeCallback();
            setCloseCallback(null);
        }
    }, [closeCallback]);

    return (
        <WhatsAppAnimationContext.Provider value={{ isOpen, total, completed }}>
            {children}
            {/* Global Overlay rendered at the absolute root */}
            <BulkWhatsAppAnimation 
                isOpen={isOpen} 
                total={total} 
                completed={completed} 
                onClose={handleClose} 
            />
        </WhatsAppAnimationContext.Provider>
    );
};
