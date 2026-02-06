import React from 'react';
import { useCall } from '../context/CallContext';

/**
 * CallHistoryTimeline - Display call history for a contact
 * 
 * @param {string} mobile - Contact mobile number
 * @param {number} maxItems - Maximum number of items to show
 */
const CallHistoryTimeline = ({ mobile, maxItems = 5 }) => {
    const { callHistory } = useCall();

    // Filter call history for this contact
    const contactCalls = callHistory
        .filter(call => call.mobile === mobile)
        .slice(0, maxItems);

    if (contactCalls.length === 0) {
        return (
            <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                No call history
            </div>
        );
    }

    const formatTimeAgo = (timestamp) => {
        const now = new Date();
        const callTime = new Date(timestamp);
        const diffMs = now - callTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const getOutcomeIcon = (outcome) => {
        if (outcome === 'Confirmed') return '✓';
        if (outcome.includes('Follow')) return '⏳';
        if (outcome.includes('Not Interested')) return '❌';
        return '○';
    };

    const getOutcomeColor = (outcome) => {
        if (outcome === 'Confirmed') return '#166534';
        if (outcome.includes('Follow')) return '#b45309';
        if (outcome.includes('Not Interested')) return '#991b1b';
        return '#64748b';
    };

    return (
        <div style={{ padding: '12px' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>
                Call History
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contactCalls.map((call, idx) => (
                    <div
                        key={call.id}
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            padding: '8px',
                            background: '#f8fafc',
                            borderRadius: '6px',
                            borderLeft: `3px solid ${getOutcomeColor(call.outcome)}`
                        }}
                    >
                        <span style={{ fontSize: '1rem', color: getOutcomeColor(call.outcome) }}>
                            {getOutcomeIcon(call.outcome)}
                        </span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                                {call.outcome}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                {formatTimeAgo(call.timestamp)}
                                {call.callType && ` • ${call.callType}`}
                            </div>
                            {call.notes && (
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
                                    "{call.notes}"
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CallHistoryTimeline;
