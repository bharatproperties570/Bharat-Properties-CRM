import React, { useState, useEffect } from 'react';

const CallResolutionModal = () => {
    const [pendingCall, setPendingCall] = useState(null);

    useEffect(() => {
        const handlePendingCall = (e) => {
            const detail = e.detail;
            if (detail && detail.metadata) {
                setPendingCall(detail);
            }
        };

        window.addEventListener('resolve-pending-call', handlePendingCall);
        return () => window.removeEventListener('resolve-pending-call', handlePendingCall);
    }, []);

    if (!pendingCall) return null;

    const metadata = pendingCall.metadata || {};
    const participantName = metadata.participantName || 'Unknown';
    const number = metadata.number || '';
    const activityId = metadata.activityId;

    const handleComplete = () => {
        setPendingCall(null);
        if (activityId) {
            window.location.href = `/activities/${activityId}`;
        }
    };

    const handleDismiss = () => {
        setPendingCall(null);
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.header}>
                    <h3 style={styles.title}>📞 Call Activity Resolution</h3>
                    <button style={styles.closeBtn} onClick={handleDismiss}>&times;</button>
                </div>
                <div style={styles.content}>
                    <p>We detected a call sync for <strong>{participantName}</strong> ({number}).</p>
                    <p>You have a pending Call activity scheduled for this lead. Would you like to complete it now to keep your data accurate?</p>
                </div>
                <div style={styles.actions}>
                    <button style={styles.skipBtn} onClick={handleDismiss}>Skip for now</button>
                    <button style={styles.completeBtn} onClick={handleComplete}>Complete Activity</button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        backdropFilter: 'blur(4px)'
    },
    modal: {
        backgroundColor: '#1E293B',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '450px',
        padding: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '1px solid #334155'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
    },
    title: {
        margin: 0,
        fontSize: '1.25rem',
        fontWeight: '600',
        color: '#F8FAFC'
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: '#94A3B8',
        fontSize: '1.5rem',
        cursor: 'pointer'
    },
    content: {
        color: '#CBD5E1',
        fontSize: '0.95rem',
        lineHeight: '1.5',
        marginBottom: '24px'
    },
    actions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px'
    },
    skipBtn: {
        padding: '8px 16px',
        backgroundColor: 'transparent',
        border: '1px solid #475569',
        color: '#CBD5E1',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: '500'
    },
    completeBtn: {
        padding: '8px 16px',
        backgroundColor: '#3B82F6',
        border: 'none',
        color: 'white',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: '500'
    }
};

export default CallResolutionModal;
