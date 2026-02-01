import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);
    const [activeContact, setActiveContact] = useState(null);
    const [callContext, setCallContext] = useState(null); // { purpose, entityId, entityType }
    const [callHistory, setCallHistory] = useState([]); // [{ mobile, timestamp, outcome }]
    const [onCallComplete, setOnCallComplete] = useState(null);

    // Spam Prevention Rule: 4 Hours
    const checkSpam = (mobile) => {
        if (!mobile) return false;
        const now = Date.now();
        const fourHours = 4 * 60 * 60 * 1000;

        const lastCall = callHistory.find(c => c.mobile === mobile);
        if (lastCall && (now - new Date(lastCall.timestamp).getTime() < fourHours)) {
            return lastCall;
        }
        return null;
    };

    const startCall = (contact, context = {}, onComplete = null) => {
        if (!contact || !contact.mobile) {
            toast.error("Invalid contact number");
            return;
        }

        const spamCheck = checkSpam(contact.mobile);
        if (spamCheck) {
            const timeAgo = Math.floor((Date.now() - new Date(spamCheck.timestamp).getTime()) / (60 * 1000));
            toast.error(`Spam Alert: Called ${timeAgo} mins ago (${spamCheck.outcome})`);
            // We allow override for Managers (simulated by just showing error but not blocking completely in this MVP, 
            // or we could block. Prompt says "Anti-spam rules... Show last-call warning".
            // Implementation: We will Warn but allow proceed for now.)
        }

        setActiveContact(contact);
        setCallContext({
            purpose: context.purpose || 'General Follow-up',
            entityId: context.entityId,
            entityType: context.entityType,
            ...context
        });
        setOnCallComplete(() => onComplete);
        setIsCallModalOpen(true);
    };

    const endCall = (outcomeDetails) => {
        // outcomeDetails: { outcome, result, notes, followUpDate, duration }

        const log = {
            id: Date.now(),
            mobile: activeContact.mobile,
            contactName: activeContact.name,
            timestamp: new Date().toISOString(),
            ...callContext,
            ...outcomeDetails
        };

        // Update History
        setCallHistory(prev => [log, ...prev]);

        // Trigger Callback
        if (onCallComplete) {
            onCallComplete(log);
        }

        // Close Modal
        closeCall();
        toast.success(`Call Logged: ${outcomeDetails.outcome}`);
    };

    const closeCall = () => {
        setIsCallModalOpen(false);
        setActiveContact(null);
        setCallContext(null);
        setOnCallComplete(null);
    };

    return (
        <CallContext.Provider value={{
            startCall,
            endCall,
            isCallModalOpen,
            activeContact,
            callContext, // Exported to be read by the Modal
            closeCall
        }}>
            {children}
        </CallContext.Provider>
    );
};
